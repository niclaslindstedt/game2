// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// PACKAGING THE TAURI SHELL — the downloads for a GitHub Release.
//
// A script rather than a second config file, because two things cannot be
// written into static JSON: the VERSION, which is the game's (root
// `package.json`, moved by `scripts/update-versions.sh`) and not the shell
// crate's, and the macOS signing identity, which comes out of the build
// environment. `tauri.conf.json` holds everything that IS static; this script
// computes the rest and hands it over as a `--config` patch.
//
// What comes out, per platform, into `tauri/release/`:
//
//   Linux     a `.deb` and an `.AppImage`
//   macOS     a `.dmg` holding the `.app`
//   Windows   an NSIS `-setup.exe`
//
// …each renamed to `scanflick-<version>-<os>-<arch>.<ext>`, so a release page
// lists one shape of name across three platforms rather than the bundler's own
// `Scandinavian Flick_0.1.0_amd64.AppImage`, which has a space in it.
//
// Usage:
//   node scripts/package.mjs                     # this platform's downloads
//   node scripts/package.mjs --target <triple>   # cross/explicit target
//   node scripts/package.mjs --skip-web          # reuse an existing webroot

import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const APP_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const REPO_DIR = resolve(APP_DIR, "..");
const TARGET_DIR = join(APP_DIR, "target");
const RELEASE_DIR = join(APP_DIR, "release");
const WINDOWS = process.platform === "win32";
const NPM_COMMAND = WINDOWS ? "npm.cmd" : "npm";

/** THE GAME's version, not the shell crate's. `tauri/src-tauri/Cargo.toml`
 * keeps its own number and nothing updates it, so a download named after it
 * would claim a version no release ever had. */
const { version } = JSON.parse(readFileSync(join(REPO_DIR, "package.json"), "utf8"));
const { productName, mainBinaryName } = JSON.parse(
  readFileSync(join(APP_DIR, "src-tauri", "tauri.conf.json"), "utf8"),
);

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const option = (name) => {
  const at = args.indexOf(`--${name}`);
  return at >= 0 ? args[at + 1] : undefined;
};
const target = option("target");

/** The word the download carries for this machine's platform. */
const OS = { win32: "windows", darwin: "macos" }[process.platform] ?? "linux";

// ---------------------------------------------------------------------------
// The build
// ---------------------------------------------------------------------------

if (!flag("skip-web")) {
  run("node", [join(APP_DIR, "scripts", "bundle-web.mjs")]);
}
run(NPM_COMMAND, ["run", "icons"], APP_DIR);

/**
 * The parts of the config that cannot be static.
 *
 * A patch rather than a second config file, so `tauri.conf.json` stays the one
 * place a reader looks for the bundle's shape and this script only holds what
 * it computes.
 */
const patch = {
  version,
  bundle: {
    copyright: `Copyright © ${new Date().getFullYear()} Niclas Lindstedt`,
    macOS: {
      // NEVER UNSIGNED. Apple Silicon does not merely distrust unsigned arm64
      // code, it refuses to EXECUTE it — macOS reports that to the player as
      // "the app is damaged", the same wording it uses for a corrupted
      // download. An ad-hoc signature ("-") satisfies the kernel and is what
      // an ordinary CI run and any developer build gets; a Developer ID
      // certificate (APPLE_SIGNING_IDENTITY) is the real thing and is what a
      // release wants, with notarization on top.
      signingIdentity: process.env.APPLE_SIGNING_IDENTITY ?? "-",
    },
  },
};

const tauriArgs = ["tauri", "build", "--config", JSON.stringify(patch)];
if (target) tauriArgs.push("--target", target);

console.log(`• packaging the Tauri shell — ${OS}, version ${version}`);
run(WINDOWS ? "npx.cmd" : "npx", tauriArgs, APP_DIR);

// ---------------------------------------------------------------------------
// The downloads
// ---------------------------------------------------------------------------

/** The file kinds a release page lists. The `.app` is a directory the `.dmg`
 * carries, and a `.deb`'s sidecar files are not downloads. */
const DOWNLOADS = /\.(dmg|deb|AppImage|exe|msi)$/;

const bundles = join(profileDir(), "bundle");
if (!existsSync(bundles)) fail(`the bundler wrote nothing under ${bundles}`);

rmSync(RELEASE_DIR, { recursive: true, force: true });
mkdirSync(RELEASE_DIR, { recursive: true });
let collected = 0;
for (const file of walk(bundles)) {
  const name = basename(file);
  if (!DOWNLOADS.test(name)) continue;
  cpSync(file, join(RELEASE_DIR, releaseName(name)));
  collected += 1;
}
if (!collected) fail(`no downloads found under ${bundles}`);
console.log(`✓ ${collected} download(s) → ${RELEASE_DIR}`);

// ---------------------------------------------------------------------------

/**
 * `scanflick-<version>-<os>-<rest>`, from the bundler's own
 * `<productName>_<version>_<rest>` — where `<rest>` is the architecture and
 * the target's own suffix (`amd64.deb`, `aarch64.dmg`, `x64-setup.exe`).
 * A name that is not in that shape is kept as it is rather than guessed at.
 */
function releaseName(name) {
  for (const prefix of [`${productName}_${version}_`, `${mainBinaryName}_${version}_`]) {
    if (name.startsWith(prefix)) {
      return `${mainBinaryName}-${version}-${OS}-${name.slice(prefix.length)}`;
    }
  }
  return name;
}

/** Every file under a directory, depth first. */
function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(path));
    else out.push(path);
  }
  return out;
}

/** Where cargo puts a release build for this target. */
function profileDir() {
  return target ? join(TARGET_DIR, target, "release") : join(TARGET_DIR, "release");
}

function run(command, commandArgs, cwd = REPO_DIR) {
  execFileSync(command, commandArgs, {
    cwd,
    stdio: "inherit",
    // Windows command shims are batch files, which Node cannot execute
    // directly (EINVAL); cmd.exe must interpret them.
    shell: WINDOWS,
  });
}

function fail(message) {
  console.error(`✗ ${message}`);
  process.exit(1);
}
