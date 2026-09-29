#!/usr/bin/env node
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE DEPENDENCY LICENCE CHECK — every npm package any of this repository's
// three trees installs (the root and its workspace, the phone app under
// native/, the desktop packager under tauri/) carries a licence on the
// allow-list below, read straight out of the committed lockfiles.
//
// The lockfile is the source rather than node_modules: it records each
// package's `license` field at install time, it is what CI installs from, and
// reading it needs no install — so the check runs in a second and answers for
// exactly the tree that ships. A package whose licence is missing, or not on
// the list, fails the run by name; widening the list is a decision a pull
// request has to argue for, which is the point of keeping it here in one
// place.
//
// The list is the fleet's, the same in every game. It has two tiers, because
// what a licence asks depends on whether the package reaches a player:
// ALLOWED holds for every package, DEV_ONLY (LGPL) only for one the lockfile
// marks `dev` — build tooling that never ships in the game.
//
// An SPDX expression is read the way its licence reads: `A OR B` is fine when
// either is allowed (the choice is ours), `A AND B` only when both are.
//
// Usage:
//   make licences
//   node scripts/check-licences.mjs [--verbose]

import { existsSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

/** The licences any dependency may carry. Permissive licences (Python-2.0,
 * argparse's PSF licence, among them), plus two whose conditions shipping an
 * unmodified package already meets: MPL-2.0 (file-level copyleft on files we
 * never modify) and CC-BY-4.0 (the browser-support table, attribution carried
 * in the package). */
const ALLOWED = new Set([
  "0BSD",
  "Apache-2.0",
  "BlueOak-1.0.0",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "CC-BY-4.0",
  "CC0-1.0",
  "ISC",
  "MIT",
  "MPL-2.0",
  "Python-2.0",
  "Unlicense",
  "Zlib",
]);

/** The licences only a development-only package may carry: LGPL, for a build
 * tool that never reaches a player. */
const DEV_ONLY = new Set([
  "LGPL-2.1-only",
  "LGPL-2.1-or-later",
  "LGPL-3.0-only",
  "LGPL-3.0-or-later",
]);

/** Our OWN packages — the shared game framework
 * (`@niclaslindstedt/oss-game-framework`) — carry the game's own licence,
 * which is not a permissive one and so is not on the list above. It is
 * allowed for this scope alone: the same terms as the code it is built into,
 * from the same author, and nothing else may widen the list by carrying it. */
const OWN_SCOPE = "@niclaslindstedt/";
const OWN_LICENCE = "PolyForm-Noncommercial-1.0.0";

const LOCKFILES = ["package-lock.json", "native/package-lock.json", "tauri/package-lock.json"];

const HELP = `usage: node scripts/check-licences.mjs [--verbose]

Checks the licence of every package in ${LOCKFILES.join(", ")}
against the allow-list in this script. Exits 1 naming each package that fails.

  --verbose   also print every licence seen, with a count
  --help      this text`;

const args = process.argv.slice(2);
if (args.includes("--help") || args.includes("-h")) {
  console.log(HELP);
  process.exit(0);
}
const unknown = args.filter((a) => a !== "--verbose");
if (unknown.length > 0) {
  console.error(`check-licences: unknown argument ${unknown.join(" ")}\n\n${HELP}`);
  process.exit(2);
}
const verbose = args.includes("--verbose");

/** Whether one SPDX id is allowed for a package (`dev`: development-only). */
function allowedId(id, dev) {
  return ALLOWED.has(id) || (dev && DEV_ONLY.has(id));
}

/** Whether an SPDX expression is satisfied by the allow-list. */
function allowed(expression, dev) {
  const tokens = expression.match(/\(|\)|[^\s()]+/g) ?? [];
  let at = 0;
  const term = () => {
    const token = tokens[at++];
    if (token === "(") {
      const value = or();
      at++; // ")"
      return value;
    }
    return allowedId(token?.replace(/\+$/, ""), dev);
  };
  const and = () => {
    let value = term();
    while (tokens[at] === "AND") {
      at++;
      value = term() && value;
    }
    return value;
  };
  const or = () => {
    let value = and();
    while (tokens[at] === "OR") {
      at++;
      value = and() || value;
    }
    return value;
  };
  return tokens.length > 0 && or() && at === tokens.length;
}

console.log(`check-licences: ${ALLOWED.size} licences allowed; reading ${LOCKFILES.join(", ")}`);
const failures = [];
const seen = new Map();
let packages = 0;
for (const lockfile of LOCKFILES) {
  const path = join(root, lockfile);
  if (!existsSync(path)) {
    failures.push(`${lockfile}: missing`);
    continue;
  }
  const lock = JSON.parse(readFileSync(path, "utf8"));
  for (const [key, entry] of Object.entries(lock.packages ?? {})) {
    // The tree's own root, its workspace members and the links to them are
    // this repository's code, under its own licence.
    if (key === "" || entry.link || !key.includes("node_modules/")) continue;
    packages++;
    const licence = entry.license;
    seen.set(String(licence), (seen.get(String(licence)) ?? 0) + 1);
    const name = key.replace(/^.*node_modules\//, "");
    if (name.startsWith(OWN_SCOPE) && licence === OWN_LICENCE) continue;
    const dev = entry.dev === true;
    if (typeof licence !== "string" || !allowed(licence, dev)) {
      const ships = typeof licence === "string" && !dev && allowed(licence, true);
      failures.push(
        `${relative(root, path)}: ${name} — ${licence ?? "no licence"}${ships ? " (ships: development-only licence)" : ""}`,
      );
    }
  }
}

if (verbose) {
  for (const [licence, count] of [...seen].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(count).padStart(4)}  ${licence}`);
  }
}
if (failures.length > 0) {
  console.error(`check-licences: ${failures.length} package(s) fail the allow-list:`);
  for (const failure of failures) console.error(`  ${failure}`);
  process.exit(1);
}
console.log(`check-licences: ${packages} packages, every licence allowed`);
