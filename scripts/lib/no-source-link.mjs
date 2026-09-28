// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE LAST GATE ON A STORE BUNDLE. No phone or desktop build may link back to
// the source, or name the account the source and the web edition live under
// (strictly). The site build strips every such line when
// `VITE_SHELL_BUILD=on` (pwa/vite.config.ts, `stripWebOnly` in
// pwa/pwa-plugin.ts); this is what makes a line that slipped past that a
// failed bundle rather than a shipped one.
//
// Byte-level, over every file, so a string inside a chunk, a source map, an
// image's metadata or a zip-to-be is caught the same way.
//
// Used by native/scripts/bundle-web.mjs and tauri/scripts/bundle-web.mjs.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/** What no store bundle may contain, in any file, in any case. */
export const FORBIDDEN = ["niclaslindstedt"];

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const abs = join(dir, entry);
    if (statSync(abs).isDirectory()) walk(abs, out);
    else out.push(abs);
  }
  return out;
}

/** Every `{ file, needle }` under `dir` that names a forbidden string. */
export function findSourceLinks(dir) {
  const hits = [];
  const needles = FORBIDDEN.map((n) => Buffer.from(n.toLowerCase(), "latin1"));
  for (const file of walk(dir)) {
    // Lower-cased byte for byte: ASCII needles, so a multi-byte character
    // elsewhere in the file cannot shift or fake a match.
    const bytes = Buffer.from(readFileSync(file).map((b) => (b >= 65 && b <= 90 ? b + 32 : b)));
    for (const [n, needle] of needles.entries()) {
      if (bytes.includes(needle)) hits.push({ file: relative(dir, file), needle: FORBIDDEN[n] });
    }
  }
  return hits;
}

/** Exits the process, naming each file, when `dir` is not clean. */
export function refuseSourceLinks(dir, what) {
  const hits = findSourceLinks(dir);
  if (hits.length === 0) return;
  console.error(`\n✗ ${what} links back to the source — a store build may not:`);
  for (const { file, needle } of hits) console.error(`    ${file}: "${needle}"`);
  console.error(
    "\n  Wrap the line in <!-- web-only --> … <!-- /web-only --> (HTML) or put it behind " +
      "__SHELL_BUILD__ (code), and bundle again. A --skip-build re-pack of a plain " +
      "website build always fails here: build the bundle through this script.\n",
  );
  process.exit(1);
}
