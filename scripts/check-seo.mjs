#!/usr/bin/env node
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Structural SEO assertions (OSS_SPEC §11.3) over the built site in
// pwa/dist/. Errors exit 1 and block CI; run with `npm run check:seo` after
// a build. Pattern copied from the sibling contacts app.
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
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

// §11.3.9 — critical-path JS budget: every render-blocking/entry script,
// 600 KB min / 175 KB gzip.
const assetsDir = join(dist, "assets");
let rawTotal = 0;
let gzipTotal = 0;
if (existsSync(assetsDir)) {
  for (const f of readdirSync(assetsDir)) {
    if (!f.endsWith(".js")) continue;
    const path = join(assetsDir, f);
    rawTotal += statSync(path).size;
    gzipTotal += gzipSync(readFileSync(path)).length;
  }
}
assert(rawTotal > 0, "no JS bundles found under dist/assets/");
assert(
  rawTotal <= 600 * 1024,
  `critical-path JS ${(rawTotal / 1024).toFixed(0)} KB exceeds 600 KB`,
);
assert(
  gzipTotal <= 175 * 1024,
  `critical-path JS ${(gzipTotal / 1024).toFixed(0)} KB gzip exceeds 175 KB`,
);

if (failures.length > 0) {
  console.error("check-seo: FAILED");
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.log(
  `check-seo: ok (JS ${(rawTotal / 1024).toFixed(0)} KB raw / ${(gzipTotal / 1024).toFixed(0)} KB gzip)`,
);
