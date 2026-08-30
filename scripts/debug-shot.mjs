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
// TWO KINDS OF REPRO LINE, because there are two places one is copied from.
// The driving overlay's carries god mode's camera pose; the developer MAP's
// (menu-roam.tsx's COPY DEBUG INFO) carries `roam=1` and the map camera's
// framing instead. They are told apart by that flag, because they need
// different things waited on: the driving frame mounts the overlay and its
// REPRO row, and the map page mounts neither — it hands its facts to the
// clipboard instead, which is what this reads them off.
//
// `--drive` takes a MAP repro and goes STRAIGHT INTO THE SEEDED LEVEL it
// describes: same seed, same dials, same conditions, same car, driving. A
// defect noticed from above is usually reported from above, and the first
// question about it is always what it looks like from the road.
//
//   node scripts/debug-shot.mjs '?seed=42&start=1&debug=1&god=1&gx=…'
//   node scripts/debug-shot.mjs 'http://host/?…' --out before --wait 4000
//   node scripts/debug-shot.mjs '?seed=42&roam=1&mapfull=1&maz=…' --portrait
//   node scripts/debug-shot.mjs '?seed=42&roam=1&…' --drive --out from-the-road
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
  console.error(
    "usage: node scripts/debug-shot.mjs '<repro query or url>' [--out name] [--drive] [--portrait]",
  );
  console.error("  the repro line is printed along the foot of the debug overlay,");
  console.error("  or copied off the developer map's COPY DEBUG INFO button");
  console.error("  --drive re-takes a MAP repro from the road, on the same seed");
  process.exit(2);
}
const raw = positional[0];
const query = raw.includes("?") ? raw.slice(raw.indexOf("?")) : `?${raw}`;

/** The tools are FORCED on whatever the pasted line says. A repro captured
 * from a plain racing screenshot carries `debug=1` already, but one typed by
 * hand from a bug report may not — and a capture with no overlay in it
 * cannot be compared against the picture it is meant to reproduce.
 *
 * `start=1` is what clears the attract screen (splash.ts's `splashSkipped`),
 * so it goes on every line whichever page the repro names — without it the
 * capture is a photograph of the title card, which is the one failure mode
 * of this tool that still produces a plausible-looking PNG. */
const params = new URLSearchParams(query);
params.set("start", "1");
params.set("debug", "1");

/** `--drive`: take the map's repro down onto the road. The stage, the dials,
 * the conditions and the car are all already in the line — what makes it a
 * MAP repro is the page flag and the map camera's framing, so dropping those
 * leaves a line that opens the same seed, driving. */
if (has("drive")) {
  for (const key of ["roam", "mapfull", "maz", "mpitch", "mzoom", "mpanx", "mpanz", "layer"]) {
    params.delete(key);
  }
}

/** Whether this line names the developer's MAP rather than a driving frame.
 * The two mount different things, so they are waited on differently. */
const onMap = params.get("roam") === "1";

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
// The map page reads its own facts back off the clipboard (below), which
// needs the permission granted before anything presses the button.
const page = await browser.newPage({
  viewport,
  permissions: onMap ? ["clipboard-read", "clipboard-write"] : undefined,
});
page.on("pageerror", (err) => console.error(`[pageerror] ${err.message}`));

await page.goto(`http://127.0.0.1:${port}/?${params.toString()}`, { waitUntil: "load" });
await page.waitForSelector("canvas.game-canvas");

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

/** What to wait for, and how to read the facts back, on each of the two
 * pages a repro line can name.
 *
 * DRIVING: the overlay mounts only once a stage is standing and the first
 * snapshot has been taken, so waiting for its REPRO row is waiting for the
 * world, and the rows are right there in the DOM.
 *
 * THE MAP: no overlay — the page deliberately keeps its pixels and puts the
 * same facts on the clipboard instead (menu-roam.tsx). So the wait is for
 * the copy button to report a stage to describe (`data-ready`, which is
 * exactly what it is for), and the facts are read by pressing the button the
 * developer would press and taking what it wrote. Reading them through the
 * real control rather than around it means this cannot report facts a person
 * standing at the page could not get. */
await page.waitForSelector(onMap ? '[data-map-copy][data-ready="1"]' : ".debug-repro", {
  timeout: 120000,
});
await page.waitForTimeout(settle);

// The PICTURE first, and on the map page that ordering is load-bearing:
// pressing the copy button turns it into its own receipt, and a capture
// taken afterwards is a photograph of the tool rather than of the stage.
const file = join(outDir, `${name}.png`);
await page.screenshot({ path: file });

const facts = await (async () => {
  if (!onMap) return page.evaluate(READ_FACTS);
  await page.click("[data-map-copy]");
  try {
    return await page.evaluate("navigator.clipboard.readText()");
  } catch (err) {
    // The picture is the deliverable; the text is the bonus. A clipboard
    // the browser would not hand back is worth one line, not a failure.
    return `[no facts] the map's copy button did not yield text (${err.message})`;
  }
})();

console.log(facts);
console.log(`\npreviews/${name}.png`);

await browser.close();
server.close();
