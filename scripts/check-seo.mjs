#!/usr/bin/env node
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Structural SEO assertions (OSS_SPEC §11.3) over the built site in
// pwa/dist/. Errors exit 1 and block CI; run with `npm run check:seo` after
// a build. Pattern copied from the sibling contacts app.
import { existsSync, readFileSync, statSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { join } from "node:path";

const dist = join(process.cwd(), "pwa", "dist");
const failures = [];

function assert(cond, message) {
  if (!cond) failures.push(message);
}

assert(existsSync(dist), "pwa/dist/ missing — run `npm run build` first");

const indexPath = join(dist, "index.html");
assert(existsSync(indexPath), "dist/index.html missing");
const html = existsSync(indexPath) ? readFileSync(indexPath, "utf8") : "";

// Head signals.
assert(/<title>[^<]{5,}<\/title>/.test(html), "missing or empty <title>");
assert(html.includes('name="description"'), "missing meta description");
assert(html.includes('rel="canonical"'), "missing canonical link");
assert(html.includes('property="og:title"'), "missing og:title");
assert(html.includes('property="og:image"'), "missing og:image");
assert(html.includes('name="twitter:card"'), "missing twitter:card");
assert(html.includes("application/ld+json"), "missing JSON-LD block");
assert(html.includes('rel="manifest"'), "missing manifest link (PWA)");
assert(html.includes('name="theme-color"'), "missing theme-color meta");
assert(html.includes("apple-touch-icon"), "missing apple-touch-icon link");

// The og:image the meta points at must actually ship.
const og = /property="og:image"\s+content="([^"]+)"/.exec(html)?.[1];
if (og) {
  const file = og.split("/").pop();
  assert(existsSync(join(dist, file)), `og:image points at ${file}, which is not in dist/`);
}

// JSON-LD must parse and agree with the og:image.
const ld = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html)?.[1];
if (ld) {
  try {
    const doc = JSON.parse(ld);
    assert(
      doc.image && og && doc.image.endsWith(og.split("/").pop()),
      "JSON-LD image drifted from og:image",
    );
    assert(doc["@type"] === "VideoGame", "JSON-LD lost its VideoGame type");
  } catch {
    failures.push("JSON-LD block does not parse as JSON");
  }
}

// Crawler files.
for (const f of ["robots.txt", "sitemap.xml", "llms.txt"]) {
  assert(existsSync(join(dist, f)), `${f} missing from dist/`);
}
const llms = existsSync(join(dist, "llms.txt")) ? readFileSync(join(dist, "llms.txt"), "utf8") : "";
assert(/^# /.test(llms), "llms.txt must start with `# Site title`");

// PWA shape in the built output.
assert(existsSync(join(dist, "manifest.webmanifest")), "manifest.webmanifest missing");
assert(existsSync(join(dist, "sw.js")), "sw.js missing");
assert(existsSync(join(dist, "precache-manifest.json")), "precache-manifest.json missing");
if (existsSync(join(dist, "manifest.webmanifest"))) {
  const manifest = JSON.parse(readFileSync(join(dist, "manifest.webmanifest"), "utf8"));
  assert(manifest.name && manifest.name.length > 3, "manifest name empty");
  assert((manifest.short_name ?? "").length <= 12, "manifest short_name over 12 chars");
  assert(
    (manifest.icons ?? []).some((i) => i.purpose === "maskable"),
    "manifest lacks a maskable icon",
  );
}

// §11.3.9 — critical-path JS budget: the ENTRY chunk plus every chunk the
// static HTML pulls via `<link rel="modulepreload">` — exactly the scripts
// that gate first render, which is what the spec bounds. Chunks fetched
// later through dynamic import (the three.js render stack) are off the
// critical path on purpose and outside this sum; total transfer is still
// bounded by the precache manifest.
const critical = new Set();
for (const m of html.matchAll(/<script[^>]*type="module"[^>]*src="([^"]+)"/g)) critical.add(m[1]);
for (const m of html.matchAll(/<script[^>]*src="([^"]+)"[^>]*type="module"/g)) critical.add(m[1]);
for (const m of html.matchAll(/<link[^>]*rel="modulepreload"[^>]*href="([^"]+)"/g)) {
  critical.add(m[1]);
}
let rawTotal = 0;
let gzipTotal = 0;
for (const src of critical) {
  // Refs are base-prefixed (`/`, `/preview/`, …) — resolve by their tail.
  const tail = src.includes("/assets/")
    ? join("assets", src.split("/").pop())
    : src.split("/").pop();
  const path = join(dist, tail);
  if (!existsSync(path)) {
    failures.push(`critical script ${src} not found in dist/`);
    continue;
  }
  rawTotal += statSync(path).size;
  gzipTotal += gzipSync(readFileSync(path)).length;
}
assert(rawTotal > 0, "no critical-path JS referenced from index.html");
// The ceiling, not the target: it is here to catch a chunk that has run
// away, not to argue about a kilobyte. The gzip figure is the one a player
// on a phone actually waits for, and it is held proportional to the raw one
// so the two cannot drift into disagreeing about what "too big" means.
const RAW_BUDGET_KB = 1000;
const GZIP_BUDGET_KB = 300;
assert(
  rawTotal <= RAW_BUDGET_KB * 1024,
  `critical-path JS ${(rawTotal / 1024).toFixed(0)} KB exceeds ${RAW_BUDGET_KB} KB`,
);
assert(
  gzipTotal <= GZIP_BUDGET_KB * 1024,
  `critical-path JS ${(gzipTotal / 1024).toFixed(0)} KB gzip exceeds ${GZIP_BUDGET_KB} KB`,
);

if (failures.length > 0) {
  console.error("check-seo: FAILED");
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.log(
  `check-seo: ok (JS ${(rawTotal / 1024).toFixed(0)} KB raw / ${(gzipTotal / 1024).toFixed(0)} KB gzip)`,
);
