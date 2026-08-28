#!/usr/bin/env node
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Stand where a screenshot was taken.
//
// The debug overlay (pwa/src/game/debug-hud.tsx) prints a REPRO line on
// every frame: a query string carrying the seed, the generator dials, the
// conditions, the car, and god mode's camera pose. Hand that line to this
// script and it serves the built app, opens it at exactly that frame, waits
// for the world to stand up, and captures it — plus the overlay's own rows
// as text, so the numbers can be compared rather than squinted at.
//
// That is the whole loop this tool exists for: somebody reports a problem
// with a picture, you reproduce the picture, you change the code, and you
// capture the same frame again. Before and after are then two files of the
// same place rather than two opinions about it.
//
//   node scripts/debug-shot.mjs '?seed=42&start=1&debug=1&god=1&gx=…'
//   node scripts/debug-shot.mjs 'http://host/?…' --out before --wait 4000
//   node scripts/debug-shot.mjs '?seed=42&start=1&debug=1' --portrait
//
// Needs `npm i --no-save playwright-core` and a Chromium; CHROMIUM_PATH
// overrides discovery, exactly as scripts/screenshot.mjs does.
import { mkdirSync } from "node:fs";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "pwa", "dist");
const outDir = join(root, "previews");

const MIME = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webmanifest": "application/manifest+json",
  ".ico": "image/x-icon",
  ".txt": "text/plain",
  ".xml": "application/xml",
};

const args = process.argv.slice(2);
const flag = (name, fallback = null) => {
  const at = args.indexOf(`--${name}`);
  return at >= 0 && at + 1 < args.length ? args[at + 1] : fallback;
};
const has = (name) => args.includes(`--${name}`);

/** The repro line, however it was pasted: a bare query, a whole URL off the
 * COPY URL button, or a query with the leading `?` already trimmed by a
 * shell. Anything that is not a flag or a flag's value is a candidate. */
const flagValues = new Set(
  ["out", "wait", "viewport"].map((n) => flag(n)).filter((v) => v !== null),
);
const positional = args.filter((a) => !a.startsWith("--") && !flagValues.has(a));
if (positional.length === 0) {
  console.error("usage: node scripts/debug-shot.mjs '<repro query or url>' [--out name]");
  console.error("  the repro line is printed along the foot of the debug overlay");
  process.exit(2);
}
const raw = positional[0];
const query = raw.includes("?") ? raw.slice(raw.indexOf("?")) : `?${raw}`;

/** The tools are FORCED on whatever the pasted line says. A repro captured
 * from a plain racing screenshot carries `debug=1` already, but one typed by
 * hand from a bug report may not — and a capture with no overlay in it
 * cannot be compared against the picture it is meant to reproduce. */
const params = new URLSearchParams(query);
params.set("start", "1");
params.set("debug", "1");

const viewport = (() => {
  if (has("portrait")) return { width: 390, height: 844 };
  const spec = flag("viewport");
  const match = spec && /^(\d+)x(\d+)$/.exec(spec);
  return match
    ? { width: Number(match[1]), height: Number(match[2]) }
    : { width: 1280, height: 720 };
})();
const name = flag("out", `debug-${params.get("seed") ?? "shot"}`);
/** How long to let the world settle after the overlay appears, ms. The
 * renderer streams terrain and flora in around the camera, and a capture
 * taken the instant the boxes come up is a picture of a stage still
 * building itself. */
const settle = Number(flag("wait", "3500"));

mkdirSync(outDir, { recursive: true });

const server = createServer(async (req, res) => {
  const path = (req.url ?? "/").split("?")[0];
  const file = join(dist, path === "/" ? "index.html" : path.slice(1));
  try {
    const body = await readFile(file);
    res.writeHead(200, { "content-type": MIME[extname(file)] ?? "application/octet-stream" });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end("not found");
  }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const port = server.address().port;

const { chromium } = await import("playwright-core");
const executablePath = process.env.CHROMIUM_PATH;
const browser = await chromium.launch(executablePath ? { executablePath } : undefined);
const page = await browser.newPage({ viewport });
page.on("pageerror", (err) => console.error(`[pageerror] ${err.message}`));

await page.goto(`http://127.0.0.1:${port}/?${params.toString()}`, { waitUntil: "load" });
await page.waitForSelector("canvas.game-canvas");
// The overlay only mounts once a stage is standing and the first snapshot
// has been taken, so waiting for it is waiting for the world.
await page.waitForSelector(".debug-repro", { timeout: 120000 });
await page.waitForTimeout(settle);

/** The overlay's own rows, read out of the DOM rather than off the picture.
 * `data-k` on every row is what makes this possible — see debug-hud.tsx.
 * Written as a source string, like the readers in screenshot.mjs: it runs
 * inside the page, where this file's Node globals do not apply. */
const READ_FACTS = `(() => {
  const out = [];
  for (const box of document.querySelectorAll(".debug-box")) {
    out.push("[" + (box.querySelector(".debug-box-title")?.textContent ?? "") + "]");
    for (const row of box.querySelectorAll(".debug-row")) {
      out.push("  " + row.getAttribute("data-k") + ": " +
        (row.querySelector(".debug-row-v")?.textContent ?? ""));
    }
  }
  out.push("[REPRO] " + (document.querySelector(".debug-repro-text")?.textContent ?? ""));
  return out.join("\\n");
})()`;
const facts = await page.evaluate(READ_FACTS);

const file = join(outDir, `${name}.png`);
await page.screenshot({ path: file });
console.log(facts);
console.log(`\npreviews/${name}.png`);

await browser.close();
server.close();
