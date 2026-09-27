// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Builds the website and copies its `dist/` output into `tauri/webroot/`, which
// the desktop shell serves from a private scheme (`shell/src/webroot.rs`). This
// is what makes the app self-contained: the game runs entirely on-device,
// offline, and updates only when a new build ships.
//
// VITE_SHELL_BUILD=on marks it a store build: it carries no link back to the
// source and never names the web edition's host (D17 — see pwa/vite.config.ts),
// and the copy is REFUSED if it still names the owner's account
// (scripts/lib/no-source-link.mjs).
//
// The website build is otherwise the ordinary `vite build` with the default base `/`,
// which is exactly what a single-origin shell wants — the service worker it
// emits is still in the bundle, and the page leaves it unregistered on its own
// once it sees the shell's global (`pwa/src/shell-host.ts`).
//
// `--skip-build` copies whatever the last build left in `pwa/dist/`, for
// iterating on the shell without paying for the site each time. Every release
// path builds.
//
// Usage:
//   node scripts/bundle-web.mjs                # build the site, then copy
//   node scripts/bundle-web.mjs --skip-build   # re-copy an existing dist/

import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, rmSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { refuseSourceLinks } from "../../scripts/lib/no-source-link.mjs";

const APP_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const REPO_DIR = resolve(APP_DIR, "..");
const DIST_DIR = join(REPO_DIR, "pwa", "dist");
const OUT_DIR = join(APP_DIR, "webroot");
const WINDOWS = process.platform === "win32";

const skipBuild = process.argv.includes("--skip-build");

if (!skipBuild) {
  console.log("• building website (npm run build --workspace pwa)…");
  // Run from the repo root so the workspace + engine alias resolve. The
  // deploy base is the default `/`; the one thing decided at build time is
  // that this is a store build (VITE_SHELL_BUILD).
  try {
    execFileSync(WINDOWS ? "npm.cmd" : "npm", ["run", "build", "--workspace", "pwa"], {
      cwd: REPO_DIR,
      stdio: "inherit",
      // Windows command shims are batch files, which Node cannot execute
      // directly (EINVAL); cmd.exe must interpret them.
      shell: WINDOWS,
      env: { ...process.env, VITE_SHELL_BUILD: "on" },
    });
  } catch {
    // The build's own output is already on the terminal; a stack trace out
    // of `execFileSync` under it would say nothing it has not said.
    console.error(
      "✗ the website build failed — see above. From a fresh clone, run `npm install` " +
        "at the repo root first.",
    );
    process.exit(1);
  }
}

if (!existsSync(DIST_DIR) || !statSync(DIST_DIR).isDirectory()) {
  console.error(
    `✗ no website build at ${DIST_DIR}. Run without --skip-build, or build the site first.`,
  );
  process.exit(1);
}
if (!existsSync(join(DIST_DIR, "index.html"))) {
  console.error(`✗ ${DIST_DIR} has no index.html — that is not a site build.`);
  process.exit(1);
}

refuseSourceLinks(DIST_DIR, "the desktop bundle");

// Replace wholesale rather than merge: a stale chunk left behind from a
// previous build is the exact failure mode that shows up as a blank window
// (index.html referencing hashed files that no longer exist, or vice versa).
rmSync(OUT_DIR, { recursive: true, force: true });
mkdirSync(OUT_DIR, { recursive: true });
cpSync(DIST_DIR, OUT_DIR, { recursive: true });

console.log(`✓ webroot → ${OUT_DIR}`);
